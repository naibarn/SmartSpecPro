# TDD plan: Vertical Drama start/stop frame generation

Tests use the existing Vitest setup and current Vertical Drama fixtures. Write
the focused test or extend the nearest existing suite before changing the
corresponding production behavior. Keep existing start-frame tests intact.

## 1. Objective and boundaries

- Test that a legacy episode with no stop fields still renders and remains
  start-only ready.
- Test that no stop prompt/image operation is triggered on initial episode
  load or start-only generation.

## 2. Existing call path and constraints

- Test that the existing start mutation, job status shape, labels, and start
  callbacks remain compatible.
- Test that stop execution does not route through `repairStageOutput`.

## 3. Architecture decision

- Test that start and stop use the same reference/composition facts but pass
  distinct `frameRole` values.
- Test that the nine-shot batch output remains start-only and is not expanded
  with stop results.

## 4. Shared role-aware prompt contract and skills

- Thanwa semantic fixture: start ends before phone disposal; stop selects the
  phone-disposal/identity-abandonment terminal beat.
- Role/version validation: accept legacy v1 for old start callers, require
  role-aware v2 for stop, reject role mismatch, malformed JSON, empty prompt,
  and truncated output.
- Long prompt boundary: a 6,000-character start prompt is passed to stop
  authoring byte-for-byte; an over-limit model request fails explicitly without
  silently changing persisted text.
- Policy rewrite test confirms policy-safe rewriting does not reorder or erase
  benign story events.
- Handoff test confirms opening moment, terminal candidate, continuity locks,
  and source revision are bounded and stable.

## 5. Shared contract, hashing, JSONB merge, and server API

- Hash tests assert exact UTF-8 SHA-256 format and stable canonical source
  revision regardless of object key insertion order.
- Merge tests preserve stop fields through whole start-plan regeneration, start
  prompt save, generic JSONB updates, and character/location/product updates.
- Invalidation tests distinguish start-prompt/continuity/reference changes
  (stale the approved stop asset) from start-image-only replacement (invalidate
  pair evidence without deleting the stop prompt).
- CAS tests reject a stop result or stop image whose expected start hash is no
  longer current, while preserving history for inspection.
- Ownership and idempotency tests cover cross-tenant/episode/shot rejection,
  duplicate enqueue, reload, retry, and no duplicate credit reservation.
- Stop API tests cover enqueue/status/save/submit/persist/set/replace/clear and
  worker-only execution authorization.

## 6. Canonical media and video/provider integration

- Mapping tests use single-shot and multi-shot clips, ordered first/last shot
  numbers, missing stop, stale/deleted/unauthorized stop, and conflicting LLM
  IDs. Canonical approved IDs must win.
- Mode tests calculate effective mode only after canonical sync and cover bridge
  support, reference limits, flag off, and start-only fallback.
- Formatter tests include last-image grounding only when a valid stop asset is
  attached and preserve current start-only wording otherwise.
- URL projection tests resolve authorized stop assets and never expose a raw
  provider URL or cross-tenant media.

## 7. Storyboard UI and client state

- Render tests show independent Start/Stop slots, role-specific prompt/image
  buttons, optional Stop copy, and unchanged start labels/test IDs.
- Interaction tests verify stop prompt generation does not call start mutation,
  stop image submission is explicit, picker target cannot fall through to the
  start slot, and start remains usable when stop errors or is unsupported.
- State tests cover empty, prompt-ready, loading, success, error, stale,
  expired, unsupported, retry, replace, clear, and reload/resume states.
- Accessibility/i18n tests cover role+shot names, keyboard order, visible focus,
  disabled explanations, Thai strings, English fallback, and reduced motion.

## 8. Tests and verification

- Run focused Vitest files with jsdom from repo root.
- Run `npm --workspace apps/web run check` and report baseline failures without
  treating a timeout as a pass.
- Run `git diff --check`.
- Record browser evidence only when authenticated browser execution is actually
  available; otherwise record the blocker.

## 9. Rollout, observability, and recovery

- Feature-flag tests confirm `verticalDramaSeriesFirstLastFrameBridge` gates
  provider attachment only, while Stop prompt/image controls remain visible.
- Telemetry tests assert bounded role/hash/status metadata and exclude raw
  prompt text, image URLs, and secrets.
- Recovery tests distinguish prompt failure, admission failure, provider
  failure, import/sync failure, stale CAS rejection, and shot-link failure.
- Rollback test confirms hiding attachment does not delete stored stop prompts or
  assets and that reconciliation is idempotent.

## 10. Execution order and ownership

- Each section records the focused tests it owns and its exported contracts.
- Cross-section tests verify imports and persisted field names match before UI
  wiring is considered complete.

## 11. Completion criteria

- Thanwa fixture and all role/CAS/stale/optional-stop tests pass.
- Existing start suites pass.
- Focused verification, typecheck result, diff check, and browser/provider
  evidence status are recorded without overstating unverified boundaries.
