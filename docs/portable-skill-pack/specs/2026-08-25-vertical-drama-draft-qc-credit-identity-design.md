# Vertical Drama Draft/QC Credit Identity Design

## Problem

The Deep Story Draft transactions are created, but older deployed Credits UI
versions can put the operation text before the canonical skill name. The Draft
Quality Controller path uses a skill credit reservation without passing a skill
slug or durable run identity. Under the fixed skill settlement contract this
either fails before the LLM call or cannot produce a correctly attributed QC
ledger row.

## Goals

- Keep `Vertical Drama Deep Story Draft` as the authoritative Draft skill name.
- Record every Vertical Drama Draft QC run under the real skill slug
  `vertical-drama-draft-quality-controller`.
- Preserve tenant, skill, and run identity through reservation creation and
  full refund of an interrupted run.
- Charge the configured fixed skill fee once per QC run. LLM token estimates
  remain telemetry; they must not create a second charge or exceed the fixed
  reservation budget across evaluation/revision calls.
- Keep the Credits UI skill-first: canonical skill name as the primary label,
  operation/model text as secondary context.

## Design

1. Extend `createCreditReservation` with optional billing context while keeping
   existing non-skill call sites source-compatible. The context is forwarded to
   `deductCredits` and stored in Redis. `refundReservation` forwards the same
   identity, including the fixed `skillRunId`, to `refundCredits`.
2. Register the QC skill in the internal `skills` registry with the same slug
   and display name as its checked-in manifest. This makes settlement and the
   Credits history join authoritative instead of relying on an operation
   description.
3. Vertical Drama QC reserves exactly one fixed skill run. The first successful
   LLM response consumes the whole reservation; later bounded LLM calls only
   update measured telemetry and do not draw additional credit. Any failed run
   refunds the same fixed settlement atomically.
4. Keep the existing real LLM evaluator/reviser path unchanged. No fallback
   result is introduced; a provider or schema failure remains an explicit QC
   failure and is billed/refunded through the durable run identity.

## Failure and migration behavior

- Missing QC registry rows fail closed during migration validation rather than
  silently recording an unmapped skill.
- Existing Draft transactions are not rewritten. Once the current frontend is
  deployed, the existing `skillSlug` join displays the canonical Draft skill
  name first.
- Existing legacy reservation records without skill identity remain compatible
  for non-skill sources. They are not guessed or backfilled.
- Deployment must apply the additive registry migration and restart the web
  process before production UI/credit behavior can be observed.

## Verification

- Reservation tests assert skill/tenant/run identity is forwarded and retained
  for refund.
- QC tests assert the real default reservation is configured for the QC skill
  and consumes one fixed reservation across multiple LLM calls.
- Migration and focused TypeScript/Vitest checks verify the registry contract
  and the Credits skill-first display path.

## Trade-offs

Using one fixed reservation per QC run matches the existing fixed skill pricing
and makes refund atomic and auditable. It intentionally does not turn provider
token estimates into a second variable charge; those estimates remain visible
in QC telemetry only.
