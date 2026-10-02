# Orchestra Lifecycle — Spec 262

Goal: complete the Spec262 deep plan, implement its repository-local sections, then review and close implementation gaps without overwriting concurrent Spec260 work.
Scope/risk: large / high
Current stage: IMPLEMENT
Resume from: IMPLEMENT
Stop reason: loop_policy_tool_call_limit
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: Spec262 `spec.md`; prior R1.8 alignment; deep-plan setup JSON
    exit_evidence: 18/18 sections complete; sections checker 18/18; UI contract checker 18/18; 513 acceptance IDs and 44 scenarios mapped; plan self-review rounds 1–5 recorded
    attempt: 1
    stale: false
    next_action: none
  - stage: TDD_DESIGN
    status: IN_PROGRESS
    entry_evidence: all section docs specify tests-first coverage; deep-implement config uses npm --prefix apps/web test --
    exit_evidence: pending section-first RED/GREEN evidence for all implemented behavior
  - stage: IMPLEMENT
    status: IN_PROGRESS
    entry_evidence: deep-implement setup succeeded; sections 01–18 registered; section 01 worker regression guard implemented
    exit_evidence: pending local implementation and focused proof for sections 02–18
  - stage: VERIFY
    status: PENDING
  - stage: DEBUG_FIX
    status: PENDING
  - stage: REVIEW
    status: PENDING
  - stage: FINAL_VERIFY
    status: PENDING

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: PLANNING
    classification: MUST_DO_NOW
    severity: HIGH
    condition: Deep plan/sections and test traceability not yet complete
    evidence: complete after all 18 sections, five plan review rounds and passing plan checkers
    owner: conductor + bounded section writers
    action: closed; proceed to section-first implementation and proof
    attempts: 1/5
    stale_gates: [section completeness, plan review]
    status: CLOSED
    resume_from: IMPLEMENT
    residual_risk: none yet
  - gap_id: GAP-2
    discovered_at_stage: PLANNING
    earliest_affected_stage: IMPLEMENT
    classification: VERIFY_ONLY
    severity: HIGH
      condition: Production provider, Cloudflare account/tunnel, DB migration and calibrated model evidence are not available from repository inspection
    evidence: documented in Spec262 claude-research.md; no live provider/account calls made
    owner: external environment/operator gate
    action: complete local implementation first; reserve real provider/Cloudflare/migration/model verification for final gate
    attempts: 0/1
    stale_gates: [production evidence]
    status: OPEN
    resume_from: FINAL_VERIFY
    residual_risk: production availability and life-safety validity unproven
  - gap_id: GAP-3
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: IMPLEMENT
    classification: MUST_DO_NOW
    severity: HIGH
    condition: Sections 06/07 acquisition-to-capture/observation durable worker pipeline and Section 13 watch evaluation-to-notification/outbox are not end-to-end integrated
    evidence: orchestra/spec262/gap-review.md loops 7, 9 and 10; source adapter and hydro contracts currently have only local contract/fixture coverage
    owner: conductor
    action: implement canonical worker_jobs/outbox admission, fenced persistence and event-driven watch notification before claiming section completion
    attempts: 1/5
    stale_gates: [durable acquisition, capture provenance, observation series, watch delivery]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: sources cannot currently populate live hydro/event projections or deliver reliable watch notifications
  - gap_id: GAP-4
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: IMPLEMENT
    classification: MUST_DO_NOW
    severity: HIGH
    condition: Sections 14-18 privacy/offline/provider-ops/model-governance/integrated acceptance are implemented as partial helpers rather than complete product and server workflows
    evidence: orchestra/spec262/gap-review.md loops 10, 22, 24–25, and 32–34; local Chat draft/context behavior is fixed, but no end-to-end integration or browser acceptance evidence exists for the remaining section workflows
    owner: conductor
    action: continue repository-local implementations and integration tests, maintaining explicit capability/source/model gates
    attempts: 1/5
    stale_gates: [privacy enforcement, offline sync, provider administration, model approval/replay, integrated UI acceptance]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: multiple Spec262 requirements are not yet user-operable or end-to-end proven
  - gap_id: GAP-5
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: IMPLEMENT
    classification: MUST_DO_NOW
    severity: HIGH
    condition: Anonymous users saw authenticated Chat and Task Control affordances, and panel open attempted protected conversation creation before respecting auth state
    evidence: `chat.createConversation` is protected; covered by `orchestra/spec262/gap-review.md` loops 35–44 and FeedbackButton guest/auth-restoration tests
    owner: conductor
    action: show localized existing sign-in flow to guests, keep public feedback, hide Task Control/full Chat tools, and never stage map context while anonymous
    attempts: 1/5
    stale_gates: [guest access gate, no protected mutation, no anonymous map-context staging]
    status: CLOSED
    resume_from: IMPLEMENT
    residual_risk: live OAuth redirect and browser route restoration not verified in this pass

Latest local evidence (2026-10-01):
  - Local `apps/web/.env` development database has Spec262 migrations 0378, 0379 and 0380 applied. The pending 0380 SQL passed a rollback preflight before `npm run db:migrate`; its ledger hash appears once after apply, the observation provenance null-check is zero, and no legacy observations required fallback. The root `.env` remote target was not used; production migration status remains an external gate.
  - Drizzle migration validation was blocked by duplicate snapshot IDs in `0146`/`0147` and `0148` pointing at the duplicate. Repaired only the lineage metadata (`0147.id`, `0147.prevId`, `0148.prevId`); parsed snapshot payloads remain byte-semantically unchanged. `drizzle-kit check` now passes and the focused migration/contract/admission suite passes 3 files/11 tests. No live migration was applied.
  - Section 07 schema provenance gap was narrowed with journaled additive migration `0380_spec262_hydrology_observation_provenance`: raw/normalized value-unit pairs, distinct received/normalized clocks, freshness, stable source observation identity, correction link, and tenant/source-consistent station/capture constraints. Legacy time/value fallback is tagged in provenance. Focused migration/contract/admission tests pass; migration is not applied. GAP-3 remains open because there is still no capture/observation executor or lease-fenced writer.
  - R1.8.2 Chat handoff keeps map context separate from the composer draft, appends it only when the user sends, preserves the draft on removal, and retains ChatView while switching panel tabs. Four focused frontend test files pass (19/19).
  - Shared geospatial tests pass (8 files, 29/29). Production Vite build emits and references the MapLibre worker; the worker asset checker passes. This does not prove browser worker startup, map rendering, overlays, or Cloudflare deployment.
  - Remaining blocking implementation includes viewport-adaptive feeds, approved-source durable ingestion and hydro observation capture, durable watch evaluation/notification, command-to-map response, privacy/offline operations, provider administration, and governance/release acceptance. Continue IMPLEMENT; do not enter FINAL_VERIFY as complete.
  - The public AI Chat & Feedback panel now has an anonymous TH/EN gate using the existing OAuth URL; only AI Chat entry and Send Feedback remain visible. Task Control, model/runtime/tool options, generation shortcuts, and composer are behind sign-in. Anonymous map Ask AI does not create a conversation or keep the supplied context. This is local UI/access-flow evidence only; deploy/browser redirect preservation remains unverified.
  - Four focused frontend test files pass (21/21) and final production Vite build passed (14,499 modules; 40.03s) to `/tmp/spec262-guest-chat-verified-20261001`. Full typecheck was intentionally skipped per current AGENTS.md.
  - Fresh implementation audit loops 45–54 are recorded. Area watches now reject polygon rings with >180° adjacent longitude jumps; the focused regression was observed failing before the fix and the watch/route suites pass 4/4. Source transport/contract, registry, watch and migration fixtures pass 7 files/31 tests in the current pass.
  - A read-only scout confirmed no geo refresh job type/admission/executor or hydro persistence writer exists; the Thailand catalog remains candidate-only and Spec260 source review does not capture rights/cadence/adapter approval. Existing hydro tables also omit provenance clocks/raw-normalized pairs required by Section 07. GAP-3 remains open; no provider fetching is enabled. Scout returned and is closed.

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: false
  review_converged: false
  final_verify_fresh: false
  - Focused revalidation passed 10 files/56 tests for source policy/transport/registry, Thailand qualification, geographic capability aggregation and hydro timestamp/trend behavior. Added a bounded geo-source refresh admission builder and canonical transaction-port call (7/7 tests); there is still no product caller, executor, capture persistence, or hydro writer, so GAP-3 remains open.
  - Sections 14–17 review found public map outputs do not consume the privacy helper, offline cache contracts have no runtime owner, and model governance/replay have no worker gate. Scoped public projection repair is in progress; Sections 15 and 17 remain open.
  - S14 public map/list/search location and alert geometry projection now has isolated regression coverage; missing classification fails closed, critical/responder classes suppress, and inherited alert disclosure chooses the stricter class. 2 files/7 tests passed. This is route serialization proof, not proof of the broader privacy ledger/federation requirements.

Continuation review (2026-10-01):
  - Closed one additional Section 06/07 correctness gap: freshness is derived conservatively from `acquiredAt`, per-source `staleAfterSeconds`, and each observation timestamp; future timestamps become unknown rather than current. Regression was observed RED, then GREEN.
  - Geo refresh pipeline verifies the declared SHA-256 against bounded original bytes, preserves exact bytes for immutable capture, rechecks active source/policy/adapter revision and canonical lease before publication, binds explicit station/metric semantics, and uses shared unit/datum normalization. Six focused geo-source suites pass 37/37.
  - GAP-3 remains OPEN: there is no approved active provider/source with verified rights, endpoint, attribution and cadence; the pipeline still has no concrete object-store/Drizzle implementation or canonical worker executor. Do not mark durable ingestion operational until those seams and transaction/lease fencing are implemented and tested.
  - GAP-4 remains OPEN: durable watch evaluation/notification, offline runtime, provider administration, model governance/replay gates, and integrated browser acceptance remain incomplete. External production, Cloudflare tunnel, provider and deployed-browser evidence also remain unavailable.
  - The latest clean review rounds are loops 83–84. This continuation is not final verification and does not satisfy completion invariants; resume at IMPLEMENT.

Continuation review (2026-10-01, user-requested gap closure):
  - Added `apps/web/server/services/geoSources/drizzlePersistence.ts` and focused tests. The adapter validates bounded capture bytes/hash, persists a null objectRef row before conditional storage so retries heal interrupted writes, links only after exact-byte storage, scopes lookups by tenant/source, inserts stations without update paths, validates the station/capture references before appending observations, and detects conflicting observation revisions.
  - `apps/web/server/storage.ts` now bounds collision reads for local immutable objects and for S3/R2. Async-iterable bodies are consumed under a hard byte cap; transform-only fallback requires a bounded ContentLength. R2/S3 conditional write remains fail-closed on providers without conditional create.
  - Verification: `cd apps/web && npm run test -- server/__tests__/r2-storage-abstraction.test.ts server/services/geoSources` passed 11 files/72 tests. `git diff --check` passed for the persistence, storage and review files.
  - Review loops 85–86 close persistence-port and bounded-read gaps locally. Loop 87 keeps worker registration open: no approved active provider/configuration exists, and a handler without real runtime dependencies would admit durable work it cannot execute.
  - Loop 88 closes a station identity hazard: existing/concurrently created station refs must match incoming EPSG:4326 coordinates at six-decimal stored precision; changed coordinates now fail closed instead of silently reusing stale geometry.
  - GAP-3 stays OPEN because no canonical worker executor/admission caller is composed with the new ports, and no verified source rights/endpoint/attribution/cadence exists. GAP-4 stays OPEN for watch notification delivery, offline runtime, provider admin, model governance/replay and integrated browser acceptance. Production, Cloudflare tunnel, provider account and browser claims remain unverified.
