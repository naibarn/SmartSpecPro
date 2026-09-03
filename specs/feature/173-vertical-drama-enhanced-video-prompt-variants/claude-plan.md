# Feature 173 implementation plan

## 1. Architecture and invariants

Implement Enhanced as an additive Vertical Drama capability. The current
`motionPromptPack.clips[]` fields remain the active projection consumed by
video rendering, extension handoff, assembly, and existing editors. The new
`videoPromptVariants` value is the only canonical store for alternate prompt
variants. A reader that sees no store treats the current clip as Legacy. A
malformed or future-version store is quarantined as invalid Enhanced metadata
while preserving the old Legacy-compatible projection.

Never alter the input contract or callback of `generateShotVideoPrompt`.
Enhanced has separate procedures, job keys, UI state, and persistence helpers.
The default flags are off and the readiness gate is fail-closed. Enhanced
generation writes a preview only; Apply is the only operation that changes the
active projection, except that first store creation may stamp `activeVariant:
legacy` without changing any active field.

## 2. Shared contract and persistence design

### 2.1 New shared module

Create a pure shared module near the existing contracts, preferably
`apps/web/shared/verticalDramaSeries/videoPromptVariants.ts`, containing:

- the version literal `vd-video-prompt-variants/1`;
- `legacy`/`enhanced` variant IDs and lifecycle values;
- strict Zod schemas for the store, variant metadata, full prompt bundle,
  target-model snapshot, provider lineage, diagnostic provenance, edit state,
  render provenance, and group fingerprint;
- reader/normalizer functions that safely handle absent, malformed, future, or
  missing-active-member stores;
- deterministic canonicalization and SHA-256 helpers for prompt, input,
  model/profile, media bundle, variant, and split-group fingerprints;
- projection helpers that copy every active prompt field as one complete unit,
  including negative prompt, dialogue, audio direction, model target, frame
  analysis, cast-position lock, motion profile, risk/status, and quality data;
- clip-scoped deep-merge helpers that preserve unknown JSONB fields and merge
  only the intended variant/store path;
- pure Apply validation for exact target/model/media/group fingerprints and
  Legacy's existing softer mismatch policy.

Use the existing `VideoShotMediaBundle` and its schema/fingerprint rather than
duplicating media fields. Do not put `identityQc` or render-task state inside a
prompt variant. Keep raw/private provider URLs out of stored variants.

### 2.2 Legacy lazy snapshot

When the first Enhanced terminal result is merged, read the latest clip under a
row lock/CAS. If no valid Legacy member exists, snapshot the complete current
active bundle and provenance as Legacy, set active to Legacy, and then add the
Enhanced member. If a Legacy member already exists, retain it. A successful
Enhanced result must never project into active clip fields during this merge.

### 2.3 Concurrency and render lineage

All merge/apply/edit paths use fresh reads, expected clip/pack revision or a
transaction lock, and task/job ID guards. Render task creation captures
variant ID, terminal prompt hash, target model/profile capability fingerprint,
media bundle fingerprint, and group fingerprint. Existing media is preserved;
non-matching media is classified rather than overwritten.

Update all existing motion-pack writers that replace a full pack: model
selection, start-frame completion/staleness, dialogue refresh, Legacy
generation/repair, storyboard handoff, and episode repair. They must preserve
the store or mark the affected variant stale. Do not rely on a single generic
spread if a writer can replace a clip object.

## 3. Enhanced runtime and job plan

### 3.1 Adapter boundary

Create an app-owned service such as
`apps/web/server/services/verticalDramaEnhancedVideoPrompt.ts`. It should
assemble a server-authoritative snapshot and expose narrow ports for:

- package/runtime readiness;
- input transformation into the v11 staged contract;
- isolated SDK invocation returning structured intent;
- exact provider-profile/compiler/finalizer handoff;
- variant merge and diagnostics.

The service must not let the Agent choose tenant, provider, video model,
credits, approval, URLs, or paid generation. The Agent receives minimum
necessary context, approved evidence, continuity, canonical dialogue, exact
target capability facts, and an explicit model-role block. The adapter forces
`modelRouting.mode=locked`, exactly one selected video model, empty fallbacks,
`allowCrossProviderFallback=false`, `generationMode=plan_only`, and
`researchMode=off` by default. Research is bounded and opt-in only.

Use an isolated Python runtime for the declared `openai-agents>=0.22,<0.23`
package. Do not upgrade the app's existing SDK as part of this feature. The
readiness result must include package, manifest, adapter, SDK, and provider
profile versions/hashes. Until an actual bridge plus allow-list wrapper exists,
the gate returns a clear unavailable diagnostic.

### 3.2 Readiness and admission

Implement a free `getEnhancedVideoPromptReadiness` query and repeat all checks
at paid admission/finalize/Apply. Checks include independent flags, tenant and
episode ownership, package/manifest/runtime compatibility, configured
vision-capable authoring model, exact enabled target video model/profile,
approved Feature 170 bundle and rights, duration/resolution/reference legality,
and required storyboard preconditions. Return stable machine-readable reasons
and safe user-facing copy.

Generation uses one explicit confirmation snapshot. Admission reserves only
the estimated work allowed by Core, uses a controller-owned idempotency key,
and records separate Agent token budget from provider credits. Apply, restore,
and ordinary edits are free. Finalize is a separate explicit operation after a
user edit and cannot hide a paid call inside Apply or render.

### 3.3 Durable jobs and recovery

Add a distinct Enhanced job kind using the existing durable job infrastructure
where safe. Its identity includes tenant/user/series/episode/shot, variant,
operation (`generate` or `finalize`), input revision/fingerprint, and
idempotency key. Persist structured statuses, errors, estimate/settlement,
lineage, and ordered split-shot results. Do not fan out every nine shots from
one button.

Run the slow Agent call outside the final row lock. Terminal merge re-reads
and rejects stale input, duplicate/late task IDs, disabled-operation flags,
future store data, or changed target/media fingerprints. On failure, settle
actual admitted credits and retain prior variants. Timeout/cancellation must be
retryable and must not fall back to Legacy.

## 4. Storyboard UI plan

Extend the existing `VerticalDramaStoryboardPanel`/prompt area and parent page
with an adjacent Enhanced CTA, without changing the Legacy handler or its
layout contract. The Enhanced CTA appears once per shot (not per split
sub-shot), while exact clip editors remain mapped to their own clip IDs.

Keep one `InlineEditablePromptBox`; its displayed value follows local
`viewedVariant`, while server `activeVariant` and the active-render badge stay
independent. New Enhanced preview data is not active until Apply. Enhanced
edits use a variant-scoped mutation, mark `user_edited`, clear/revalidate the
terminal hash, and require explicit bounded finalize or discard. Existing
Legacy edit behavior remains unchanged for old/no-store clips and applies only
according to the active-variant rules for opted-in clips.

Add separate status/error keys for `shotNumber + variantId`, group aggregation
for split shots, readiness details, model-role badges, cost/confirmation copy,
stale/model-change warnings, Apply/Restore controls, and provenance mismatch
display. Disable duplicate generation and Apply while any relevant job is
active, with an actionable explanation. Never bind the paid render button to a
merely viewed preview; tell the user to Apply first.

Reuse current shadcn/Tailwind tokens, localization conventions, and toast/live
region patterns. Required states are loading, empty, ready, error, stale,
disabled, selected, focus, hover, partial group, active/render mismatch, and
unknown provenance. Test 390x844, 360x800, 768x1024, and 1440x900 plus keyboard
and reduced motion behavior.

## 5. Model policy and rollout

Persist and display three distinct roles: `selectedImageModelId`/
`sourceImageModelId` for approved image assets, `authoringModelId` for the
vision/structured-output LLM, and `selectedVideoModelId` for the actual
provider target. Same-provider reuse is allowed only as an implementation
optimization. Same catalog row is valid for both image and video only when its
capabilities explicitly declare both; IDs and policies remain separate.

Add independent flags for Enhanced UI, Enhanced jobs, and Enhanced Apply.
Turning one off blocks only its operation; stored variants and Legacy remain
readable. Roll out in order: contract/reader tests, readiness blocked state,
shadow/fake adapter, tenant canary, browser proof, then live provider canary.
Collect structured-output success, provider rejection, capability/media block,
latency, token/credit cost, stale rate, Apply/regeneration, recovery, and
prompt-mismatch preservation metrics.

## 6. File ownership and execution order

1. Section 01 owns the shared contract, reader/projection/fingerprint/merge
   helpers and their unit tests, plus preservation changes to existing writers.
2. Section 02 owns the Enhanced adapter, readiness, job procedures/service,
   credit/idempotency/recovery tests, and no global skill registry change.
3. Section 03 owns the Storyboard/page integration, selector/editor/status/
   Apply UI and component tests. It consumes the stable Section 01/02 APIs.
4. Section 04 owns feature-flag wiring, model-role policy, rollout diagnostics,
   integration/regression proof, and browser/evidence scripts or test fixtures.

Likely touched paths are the shared contract module, the Vertical Drama
episodes router/services, `VerticalDramaEpisodePage.tsx`,
`VerticalDramaStoryboardPanel.tsx`, focused tests beside each module, and
feature-flag/model-policy helpers. Do not edit `.env`, unrelated skills, global
skill routing, or unrelated dirty files.

## 7. Definition of done

Every manifest section has implementation and tests; all MUST_FIX findings from
section self-review and the final integration review are closed. Legacy-focused
tests pass. Focused Enhanced tests pass. Full typecheck/browser/live-provider/
deployment results are reported truthfully, including any environment blocker.
After implementation, perform at least five documented implementation-to-spec
audit rounds and apply every high-confidence gap fix before handoff.
