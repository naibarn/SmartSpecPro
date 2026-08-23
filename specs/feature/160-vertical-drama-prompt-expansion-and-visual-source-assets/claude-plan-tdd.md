# Feature 160 — TDD Plan

Testing uses the existing Vitest server/client conventions, Drizzle schema/migration contract tests, and Playwright browser evidence. Test implementation must precede production implementation within each section. Tests must assert tenant/owner scope and flag-off parity, not only happy-path rendering.

## 1. Shared contracts and deterministic core

- Test modality/origin/semantic-role/evidence enum validation and legacy source-pack compatibility.
- Test finite segment bounds, still usage constraints, maximum durations, and invalid media-role combinations.
- Test canonical snapshot input sorting and stable/different fingerprints.
- Test visual coverage findings for required/optional, missing, stale, contradictory, and AI-illustrative sources.
- Test semantic conflict matrix: scene anchor versus reference/B-roll, product reference versus environment anchor, and duplicate active bindings.
- Test B-roll timeline order, still duration, exact video in/out, audio policy, fit/crop, disclosure, and overflow findings.
- Test news claim freshness, as-of requirements, source scope, contradiction, archive label, and AI illustration rules.

## 2. Database schema and migration

- Test schema exports contain every Feature 160 table/column and expected enum/default semantics.
- Test tenant/user/parent foreign keys and composite indexes are present in the migration text/schema metadata.
- Test active uniqueness/idempotency constraints prevent duplicate segment/binding revisions without blocking deactivated history.
- Test existing source-pack and shot-reference rows remain readable without new nullable fields.
- Test migration has no destructive drop/backfill and does not cascade into canonical `media_assets`.
- If a local DB fixture is available, run insert/read/update-stale flows through a transaction and rollback path.

## 3. Prompt expansion, research, and source-slot authoring

- Test preview is idempotent by owner/prompt hash/idempotency key and does not mutate the original premise.
- Test identifiable place/software/current-event inputs request research and expose source metadata; broad topics remain illustrative/uncertain.
- Test search unavailable, malformed LLM JSON, overlong output, unknown IDs/URLs, and provider failure degrade safely.
- Test apply compare-and-swap rejects stale original prompt and preserves current user text.
- Test apply returns the normal planning pointer and records approved revision/audit metadata.
- Test slot suggestion creates deterministic keys and bounded roles/modalities; user edits use optimistic revision.
- Test prompt/image generation only uses managed media/credit paths and labels AI output illustrative.
- Client tests cover dialog open, loading, editable preview, sources/warnings, cancel, apply, stale conflict, retry, disabled action, and flag-off parity.

## 4. Visual source snapshot and story propagation

- Test snapshot creation is owner-scoped, immutable after creation, and fingerprints approved slots/segments/evidence/profile.
- Test source changes create a new revision and stale only dependent outputs.
- Test standard draft, deep draft, premium, retry, and resume receive the same snapshot ID/fingerprint.
- Test resume rejects a changed current pack instead of silently mixing source revisions.
- Test LLM proposals cannot directly persist media IDs/URLs/evidence/timecodes.
- Test coverage gates block required missing visual sources and return actionable non-blocking findings for optional items.
- Test start-frame/reference/B-roll projections retain role and snapshot provenance.

## 5. News report and evidence lifecycle

- Test profile registry accepts `news_report` modes and preserves existing profiles.
- Test claim extraction normalizes geography, numbers, dates, as-of, attribution, and evidence requirements.
- Test claims remain needs-verification without source evidence, even when an AI image is attached.
- Test verified/partial/stale/contradictory/blocked transitions and freshness calculations.
- Test correction creates a new evidence revision, stales dependent story/media/assembly artifacts, and preserves audit history.
- Test archive/file-footage and AI illustration disclosures are mandatory in readiness output.
- Test Nan fixture maps every material claim to evidence and visual coverage findings.
- Client tests cover claim rows, sources, as-of/freshness, correction, contradiction, archive labels, and blocked publish state.

## 6. Shot semantic binding, footage segments, and B-roll assembly

- Test image reference rows remain separate from video B-roll rows.
- Test scene-anchor promotion requires explicit mode and does not delete or replace source assets.
- Test still B-roll persists display duration; video B-roll persists exact segment in/out and parent revision.
- Test cross-tenant/owner/pack/source/segment rejection, rights/disclosure blocks, stale fingerprint, invalid bounds, and missing storage.
- Test deterministic ordering, duration budgets, audio conflict, fit/crop, attribution/disclosure, and recoverable partial assembly.
- Test assembly projection includes canonical managed URLs/IDs and never provider-only URLs.
- Client tests cover modality grouping, role selection, video metadata loading, scrubber/in/out, audio policy, reorder, overflow, stale binding, and ready state.
- Browser evidence covers real photo still B-roll and real video footage exact segment through final readiness/assembly.

## 7. Flags, operational gates, security, and rollout

- Test each flag on/off and combinations; flag-off behavior remains current behavior.
- Test quality gates emit stable machine-readable findings for source admission, snapshot, draft alignment, story alignment, start-frame boundary, B-roll readiness, and news publish readiness.
- Test missing tenant, cross-user/tenant media, raw provider URL, signed URL leakage, unsafe MIME/path/timecode, and private transcript/EXIF redaction.
- Test bounded research/analysis/frame/transcript/source/media-generation limits and idempotent credit behavior.
- Test retry/cancel/provider failure/metadata failure/partial assembly recovery states.
- Test audit telemetry contains IDs/statuses/fingerprints but no secrets/raw content.

## 8. Final integration and proof

- Run all focused tests from sections 1–7 and the relevant existing Vertical Drama regressions.
- Run typecheck and migration/schema tests; separate baseline failures from Feature 160 failures.
- Run Playwright at mobile 390x844, tablet 768x1024, desktop 1440x900 and extended dense-layout viewports.
- Build a traceability test/report mapping each spec acceptance criterion to code and proof.
- Run five gap-review scripts/checklists: contracts/data, API/propagation, media/assembly, news/security, UX/tests/rollout.
- Fail finalization when any required acceptance item lacks implementation, focused test, or browser/operational evidence.
