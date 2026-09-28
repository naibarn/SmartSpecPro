# Feature 173 TDD plan

This document mirrors `claude-plan.md`. Tests are written before the
corresponding implementation and use existing Vitest/TypeScript conventions.

## 1. Architecture and invariants

- Test absent legacy store reads as Legacy without changing fields.
- Test malformed/future/missing-active-member stores are quarantined and the
  Legacy-compatible projection remains intact.
- Test Enhanced completion does not change active fields, including first lazy
  Legacy snapshot.
- Test duplicate/late completion and CAS conflict do not overwrite newer data.

## 2. Shared contract and persistence design

- Test strict schema acceptance/rejection, canonical hashes, full bundle field
  movement, Feature 170 bundle reuse, and no URL persistence.
- Test deep merge preserves unknown fields and existing variant members.
- Test Apply/restore and stale model/media/profile/group fingerprints.
- Test split-shot incomplete group blocks all projection; complete group applies
  every clip atomically.
- Test each existing motion-pack writer preserves or marks variant metadata.

## 3. Enhanced runtime and job plan

- Test readiness for each missing flag, package/SDK/manifest mismatch,
  authoring-model/vision failure, target-model capability failure, media
  authorization failure, and valid readiness.
- Test transformed input locks target routing, removes fallback, preserves
  canonical dialogue/media, and does not expose paid tools.
- Test Agent structured output is finalized once by the Core/provider compiler.
- Test admission is idempotent, credit-safe, owner-scoped, and rejects stale
  confirmation snapshots.
- Test queued/running/succeeded/failed/timeout/cancel recovery and no Legacy
  fallback; test split-shot ordered mapping.
- Test edit/finalize revision/hash CAS, explicit operation separation, and
  credit settlement.

## 4. Storyboard UI plan

- Test Legacy action props/callback/payload remain unchanged with flag off.
- Test Enhanced CTA readiness/confirmation, independent status/error, and one
  CTA per shot for split shots.
- Test one editor switches viewed variant without changing active render state.
- Test Enhanced edit persistence, finalize/discard, Apply/Restore, stale and
  partial-group blocking, and active-render badge.
- Test paid render remains bound to active projection and media mismatch copy.
- Test accessible names, selected/focus/live states, keyboard flow, long copy,
  responsive wrappers, reduced motion, and flag matrix.

## 5. Model policy and rollout

- Test image, authoring, and video IDs remain separate and are shown with role
  labels.
- Test same-row dual capability is required before model reuse.
- Test each UI/jobs/Apply flag combination and later-disable readability.
- Test Legacy regression suite, no unrelated-skill route changes, metrics
  event fields, and browser evidence fixture selection.

## Definition of done tests

Run focused Vitest files from repo root with the documented workspace command.
Run package validation separately if dependencies are available. Run browser
proof only when a browser/runtime is available. Do not convert unavailable
environment checks into passing claims.
