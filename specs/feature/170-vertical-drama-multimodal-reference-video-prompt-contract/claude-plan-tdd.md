# TDD plan — Feature 170

Tests must be written before production changes in each corresponding plan
section. Use existing Vitest and pytest conventions; use test doubles for LLM,
media resolver, provider, task, and credit boundaries. Do not require live paid
provider calls for unit/contract proof.

## 1. Section 01 — Canonical multimodal bundle, asset resolver, and persistence

- Parse legacy image-only and new versioned bundles.
- Reject video/audio in start/stop and reject prompt-only stop state.
- Resolve missing, pending, expired, revoked, wrong-kind, and cross-tenant
  assets as fail-closed errors.
- Preserve mixed reference order, labels, roles, sources, segments, and stable
  fingerprint semantics.
- Increment revisions for every mutation and reject stale compare-and-swap.
- Enforce `VD_MAX_REFERENCE_ITEMS_PER_SHOT` (default 50) and explicit
  selected-subset revision.
- Project legacy `start_frame`/`reference_frame` rows without data loss.
- Validate worker old/new pack compatibility and segment bounds.

## 2. Section 02 — Runtime capability profiles and provider adapters

- Parse complete/incomplete capability profiles and future model keys.
- Verify profile cache invalidation when model capability config/version changes.
- Select text, first/last, start-plus-reference, mixed-reference, or blocked
  modes deterministically for every attachment combination.
- Verify H3 mode boundaries, audio prerequisites, limits, and stop semantics.
- Verify Omni Flash first/last/reference reconciliation against the current
  provider contract and prevent silent drops.
- Use Seedance 2.0 and 2.5 baseline-limit fixtures with exact runtime model-key
  lookup and profile evidence.
- Register synthetic Seedance 2.6/MiniMax H4 through configuration for an
  existing transport without version-specific code.
- Reject unknown transport, incomplete profile, unsupported role, and over-limit
  payload before paid admission.
- Verify canonical order to typed native arrays and immutable prompt text.

## 3. Section 03 — Skill-first media inspection and terminal prompt finalizer

- Produce schema-valid inspected/derived/unavailable outputs for image, video,
  and audio.
- Prove every accepted asset is inspected or explicitly recorded unavailable;
  no failed item is silently removed.
- Prove bounded extraction, fingerprint/version cache, and idempotent retry.
- Treat filename/transcript/media text as untrusted content and prevent it from
  changing policy or provider mode.
- Preserve every accepted attachment label or explicit not-used reason in the
  final prompt manifest.
- Prove all deterministic additions occur before terminal finalization.
- Prove formatter, whitespace, Unicode, trim, and fallback paths cannot mutate
  terminal positive/negative prompt text.
- Prove user/model/profile/revision edits invalidate and rerun finalization.
- Prove persisted/UI/QC/outbound hashes and bundle fingerprint match.

## 4. Section 04 — Server, worker, render, bulk, retry, and recovery integration

- Rebuild bundles from authorized canonical IDs and resolve actual media URLs.
- Verify no-stop remains valid and no stop URL/field is sent.
- Verify prompt-only stop never reaches provider.
- Reject stale bundle revision, fingerprint, prompt hash, or capability profile
  before credit/task admission.
- Exercise bulk, split-shot, speaker-switch, compliance retry, repair, judge,
  worker dispatch, and completed-task recovery with the same bundle fingerprint.
- Read old worker fields and write only the new typed array contract.
- Verify terminal prompt and negative prompt are unchanged by render formatting.
- Verify provider request mapping, task idempotency, and failure classification.

## 5. Section 05 — Storyboard multimodal drag/drop and Library UX

- Add local image/video/audio and canonical Library drag payload tests.
- Reject video/audio in start/stop and spoofed MIME/content before linking.
- Verify pending upload/metadata, partial failure, retry, success, blocked, and
  stale states, including whole-video default and bounded video-segment
  selection (audio remains whole-file in v1).
- Verify image/video/audio previews, role/order/source display, reorder/remove,
  50-item ceiling, and explicit subset selection.
- Verify keyboard/button equivalents, labels, focus, invalid-drop semantics, and
  reduced-motion behavior.
- Verify capability readiness updates when model/mode changes.
- Verify final prompt display equals the terminal persisted prompt.
- Capture browser evidence at 390x844, 768x1024, 1440x900, and extended risky
  viewports when browser tooling is available.

## 6. Section 06 — Cross-section integration, ten-round gap loop, and rollout

- Run cross-package type/export and contract tests.
- Run end-to-end mocked flow from drag/Library asset through inspection,
  finalization, persistence, QC, provider mapping, worker, and recovery.
- Run the ten required gap-review rounds and record all MUST_FIX fixes.
- Verify tenant, upload safety, concurrency, credits, observability, and no raw
  URL/transcript leakage.
- Run focused web/Python suites, `git diff --check`, migration checks, and any
  feasible workspace typecheck; record timeouts as limitations, not passes.
