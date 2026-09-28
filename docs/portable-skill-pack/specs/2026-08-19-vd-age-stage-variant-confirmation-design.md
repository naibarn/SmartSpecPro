# Vertical Drama Age-Stage Variant Confirmation Design

## Goal

Make a child/teen life-stage request actionable instead of returning a generic
`INTERNAL_SERVER_ERROR`. When a lead character is stored with an adult story
role but a shot or custom request clearly requires a younger life stage, ask
the user to create the matching age-stage look, generate its portrait, and
bind that look to the shot after confirmation.

## Product contract

- `roleTier` remains the canonical story role. A childhood version of a hero is
  still `lead_male` or `lead_female` in the story roster.
- `variantType="age_stage"` plus age/life-stage facts define the visual role
  for portrait and shot generation. A child visual request uses child-safe
  visual rules and a loose family-resemblance reference lock.
- An age-stage look is usable in a shot only after it has an approved primary
  portrait. The shot stores the variant's own `characterKey`, never the adult
  parent's key for that child beat.
- A child description on an `outfit` variant is invalid for this flow and must
  be surfaced for correction as an age-stage variant.

## User flow

1. Detect a child/life-stage requirement while generating a character portrait
   or a shot, and determine whether a compatible age-stage variant is already
   available.
2. If no compatible variant is available, return a typed, recoverable result
   containing the parent character, requested age/stage, and shot reference.
3. Show a confirmation dialog explaining that the shot needs a child version
   and offer: create and bind the new look, choose an existing look, or cancel.
4. On confirmation, create an `age_stage` variant using the parent identity and
   story-role facts, generate its portrait with `visualRoleTier="child"`, and
   wait for the normal image task result.
5. When the portrait is approved, bind the variant key to the requested shot,
   invalidate any stale prompt caused by the reference change, and continue
   the normal shot-generation flow.
6. On cancellation, provider failure, insufficient credits, or timeout, keep
   the parent and shot unchanged and show a retryable status with no generic
   500 message.

## Architecture

The visual prompt boundary receives explicit visual context separate from the
canonical story role (`variantType`, life-stage/age facts, and an effective
visual tier). The prompt validator uses the effective visual tier: child
variants are validated with child-safe requirements, while adult lead quality
checks remain active for the adult parent. Existing `roleTier` persistence and
storyboard identity semantics are unchanged.

The character-generation route and shot-generation route share a small
age-stage requirement resolver. It must be deterministic, tenant/user scoped,
and must not create a variant or spend image credits without the user's
confirmation. Existing variants with approved portraits are preferred; the
confirmation is only required when the needed look is missing.

## Failure handling and safety

- Never silently convert a base adult character into a child image.
- Never weaken child-safety validation to satisfy an adult `roleTier`.
- Never expose provider URLs, credentials, or raw internal stack traces in the
  user-facing dialog.
- Variant creation and portrait generation remain owner/tenant scoped and use
  the existing credit/refund lifecycle.
- Partial failures are idempotent: a previously created matching variant is
  reused instead of creating duplicates, and a shot is bound only after an
  approved portrait exists.

## Verification

- Unit tests cover canonical `lead_male`/`lead_female` plus age-stage child
  context, effective visual-tier validation, and adult-parent preservation.
- Router tests cover the typed recoverable response, confirmation mutation,
  duplicate reuse, tenant ownership, credit failure, and shot binding.
- UI tests cover the confirmation dialog, cancel/retry states, and successful
  automatic binding.
- Run touched Vitest suites, `git diff --check`, and changed-file diagnostics.
  Authenticated browser, external provider, migration, and deployment checks
  remain explicitly separate from this patch.
