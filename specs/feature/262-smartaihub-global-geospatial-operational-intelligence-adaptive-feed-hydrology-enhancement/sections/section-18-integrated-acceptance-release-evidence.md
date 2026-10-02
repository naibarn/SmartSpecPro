# Section 18 — Integrated acceptance and release evidence

## Goal

Prove the entire active Spec262 contract through acceptance tests 1–513 and scenarios A–AR after the implementation sections are integrated. This is the release evidence layer, not a way to defer missing product behavior. Any unimplemented repository-local test is returned to its owning section; external runtime gates are explicitly typed and must not be marked PASS.

## Required test-first integration matrix

- Verify every row in `claude-acceptance-traceability.md` maps to a real focused assertion, browser/contract proof, or owner-approved external deferral. Correct semantic section mapping when needed.
- Verify every heading/scenario in `claude-requirement-traceability.md` has an owning implementation/evidence section; no normative item is silently skipped because a test was not written yet.
- Add integrated tests around real boundaries: DB transaction + outbox admission, lease/fencing worker settlement, API authorization/disclosure, shared route manifest, Cloudflare proxy, renderer assets and existing Chat panel.
- For each failure mode test the deny/fallback path: invalid/missing config, empty and missing coverage, stale data, provider outage/schema drift, unauthorized/expired refs, dirty migration state, cancellation/race, quota/load shedding and rights expiry.

## Integrated scenarios to execute

Run base scenario and every active revision scenario A–AR from the source contract, including cross-province release, flash flood, coastal/tide, transboundary flow, provider outage, offline bilingual public safety, what-if isolation, compound infrastructure hazards, rural data gap, model canary, correction/replay, mass evacuation, CAP lifecycle, remote-sensing uncertainty, redundant sensors, offline report, regional recovery, stale-data action gate, salinity/drought, multi-device watch, federation surge, accessible public map, legal-hold deletion and existing Chat scenarios AQ–AR. Each scenario records seed/fixture, role/tenant, source/config/model revision, expected public-vs-operations output, durable job/output IDs, and a specific pass assertion.

## Local verification order

1. Shared geometry/provider/map-context/hydrology pure tests.
2. Drizzle migration/schema/journal drift and focused local migration tests; no production migration.
3. Source adapters, worker/job/outbox, route/API auth, provider config and replay tests.
4. Client component tests for map/feed/watch/admin/Chat context plus localization parity and accessibility.
5. Cloudflare proxy package tests prove same route contracts and fail-closed private origin without asserting the account deployment is live.
6. Run focused package builds and production web build. Do not run `npm run typecheck` per repository policy. Capture exact commands/results and rerun stale gates after fixes.
7. Browser/manual evidence at 390x844, 768x1024, 1440x900. Verify map worker asset resolves, renderer canvas/tiles/attribution and actual authorized overlay behavior; verify feed coverage/freshness, action auth, existing panel handoff, no auto-send/context expiry, text alternative, offline and recovery states.
8. Final real environment gate only after local implementation: deployment owner verifies Linux/tunnel and Cloudflare ingress, provider rights/credentials/quotas and real data coverage, production migration/backups, and model calibration/release approvals. No secrets are printed or committed.

## Final gate classifications

- **Local pass:** source/test/build/browser evidence from this checkout only.
- **External verify-only:** credential/account/network/billing/license/real source/provider performance/production DB migration/model calibration/operator approvals. Assign owner, command/screen/evidence expected and timestamp.
- **Deferred optional:** only features below current activated capability that do not weaken life-safety correctness, privacy, security, accessibility, attribution or truthful coverage. Must include owner approval, reason, expiry/revisit date and safe disabled presentation.
- **Must-fix:** every remaining local failure, unowned heading/test, authorization gap, unsafe fallback, non-canonical job/table/route/chat authority, missing migration replay, or unexplained assertion gap.

## Completion evidence

All repository-local mandatory gates pass after the final repair/review; all requirement IDs/headings have disposition; ten gap-review rounds are recorded with evidence and closure; reviewers find no open must-fix gaps. Cloudflare/provider/production/model evidence is reported separately and cannot be described as complete unless actually run.

## UI/UX Contract

### Target User / JTBD
Release reviewers need reproducible integrated evidence; this evidence-only section does not introduce product UI.

### Surface Inventory
No new page or component. Browser evidence exercises the existing map/feed, operator settings and AI Chat & Feedback surfaces.

### Component Map
Section 18 owns test orchestration/evidence records; product component ownership stays with Sections 01–17.

### State Matrix
Record the actual integrated UI states under test and classify local, browser and external gates separately; no release evidence is itself a user-visible state.

### Responsive Matrix
Integrated browser pass uses 390x844, 768x1024 and 1440x900 plus documented risk sizes from the owning UI sections.

### Accessibility Acceptance
Verify the owning UI sections’ keyboard, screen-reader, text-alternative, contrast and reduced-motion criteria; do not invent a second accessibility contract.

### Copy Contract
Preserve copy contracts from owning sections. Evidence must not convert unavailable external verification into a pass claim.

### Browser Evidence Required
Attach timestamp/build/viewport, route, user role/tenant fixture, requests, visible state, console/network result and known external gates for each scenario.
