# Feature 160 — Synthesized Implementation Specification

## Outcome

Add an optional, skill-first prompt expansion workflow to the Vertical Drama planning flow. The user enters a short or vague premise; the system produces a complete editable interpretation in a dialog, optionally researches identifiable places/software/current events, proposes visual source slots, and applies only after user confirmation. The original prompt remains intact when cancelled.

Add a unified, tenant-safe visual-source system that supports AI-generated images, creator-uploaded real photos, creator-uploaded video footage, source segments, evidence/provenance, prompt generation, and explicit semantic usage. The same approved visual-source snapshot must be available to draft, full-story, deep-story, retry/resume, start-frame, reference, B-roll, and final assembly paths.

Add a separate `news_report` editorial profile that shares infrastructure with review/documentary workflows but requires stricter claims, source links, as-of/freshness state, attribution, archive/file-footage disclosure, correction lineage, and publish readiness gates.

## Invariants

1. All new reads and writes are tenant- and user-scoped; missing tenant identity fails closed.
2. Canonical media is an existing managed `media_assets` row/storage object, never a provider URL or raw uploaded path.
3. AI-origin media defaults to illustrative and cannot independently verify a news claim.
4. Upload origin, modality, semantic role, evidence status, rights, and disclosure are separate fields.
5. Video segments persist source media identity, parent revision, finite in/out bounds, and audio policy.
6. Image/reference bindings remain distinct from video B-roll timeline bindings.
7. Every story-generation attempt stores the visual snapshot revision and fingerprint it used; changed inputs produce stale-input findings.
8. LLM output may propose bounded slot/claim/segment keys, but the server resolves ownership, IDs, evidence state, storage, and time bounds.
9. News claims remain needs-verification until authoritative/source evidence is attached and currentness is evaluated.
10. Corrections create new revisions and stale dependent narration, subtitles, overlays, story outputs, media bindings, and assembly projections without deleting audit history.

## User journeys

### Prompt expansion

- User types a premise in the existing planning field.
- User selects an optional “ขยายโจทย์ด้วย AI” action.
- Server runs the prompt-expansion skill, classifies editorial profile, performs bounded web research for identifiable entities, and proposes a structured brief and visual plan.
- Dialog displays expanded prompt, interpretation, research sources/findings, uncertain claims, proposed slots, and warnings.
- User edits fields or rejects the result.
- Apply uses compare-and-swap against the original prompt hash, persists the approved prompt/plan, closes the dialog, and returns to the normal planning flow.

### Review/documentary visual sources

- User can ask the system to suggest image/footage slots from the approved brief.
- Each slot has a title, short description, semantic role, modality, origin, evidence state, usage policy, rights/disclosure state, and optional source/media/segment binding.
- User can generate a prompt per slot, generate an AI image, or upload/import a real photo/video.
- Video metadata must be known before segment editing; each B-roll segment preserves exact in/out and audio policy.

### News report

- User chooses `news_report` or the system recommends it and clearly marks the recommendation.
- A claim ledger shows claim text, geography, validity/as-of, sources, attribution, evidence state, freshness, contradictions, and correction state.
- Visual sources are mapped to claims only within their declared evidence scope.
- Unsupported numbers/current claims block publish readiness or remain clearly marked needs-verification.
- Archive/file footage and AI illustrations show visible disclosure labels.

## Architecture and data

Extend existing source-pack and managed-media contracts. Add normalized records only for:

- source media modality/origin/evidence/metadata and immutable segment revisions;
- immutable visual-source snapshots with deterministic fingerprints and coverage obligations;
- news claim/evidence revisions and correction lineage;
- episode/shot B-roll bindings and assembly projections.

Use existing source-pack attach transactions, story-generation run fields, shot-reference service, storage authorization, credit ledger, and assembly services. Do not overload `vertical_drama_shot_references` with video timeline data.

## Required server boundaries

- prompt expansion preview/apply/retry;
- visual slot suggestion/edit/prompt/image generation;
- source media registration/metadata/segment/analyze;
- visual snapshot create/read/coverage/reconcile;
- news claim ledger/verification/correction;
- source-to-shot reference/scene-anchor binding;
- still/video B-roll bind/unbind/reorder and assembly projection.

All mutations require ownership, bounded input, optimistic revision or idempotency, and transaction-safe stale propagation where dependencies change.

## Required UI surfaces

- editable prompt expansion dialog with clear preview/research/warning/apply/cancel states;
- planning source-slot panel with modality/origin/evidence/rights/disclosure badges and prompt/image actions;
- upload/footage card with poster, metadata, scrubber, in/out fields, audio policy, and source label;
- news claim/evidence review panel with as-of/freshness/attribution/correction states;
- episode/shot media picker separating scene anchor, image reference, still B-roll, and video B-roll timeline;
- final readiness summary explaining every blocked/stale/missing requirement.

## Quality and proof

Focused server/client tests cover schema contracts, tenant isolation, prompt CAS, research classification, snapshot fingerprints, draft/deep/resume propagation, source segment bounds, B-roll timeline ordering, news freshness/correction, and assembly gates. Playwright evidence covers the confirmed dialog flow, real-photo B-roll, exact video segment B-roll, AI-news disclosure/blocking, Nan flood claim review, correction staleness, and overflow/error recovery.

## Rollout

Use feature flags for source video footage, news profile, and visual-canon propagation. Roll out contracts/data first, then media/slots, then story propagation, then B-roll/assembly, then news/browser proof. Flag-off behavior preserves current premise, source-pack, shot-reference, and fiction flows.
