# Section 05 — Compatibility Drain Closure

## Goal

Reduce the remaining legacy transport/status surface without destructive
deletion and without creating duplicate side effects.

## Owned paths

- The three remaining direct transport call sites from the Feature 186 audit.
- The seven compatibility status readers and owning domain projections.
- `apps/web/server/services/jobTransportAdapters.ts` and related tests only as
  needed to route calls through canonical ports.
- Compatibility-drain manifest and static audits.

## Implementation

Migrate direct producers behind canonical adapters in bounded waves, preserving
legacy entrypoints as shims until evidence shows no direct caller remains.
Replace Redis status/result reads only after the owning domain checkpoint and
canonical projection are verified. Retain old task IDs only as dispatch
references through retention/reconciliation. The Python external-provider
registration bridge remains quarantined compatibility infrastructure until
Section 04's durable scheduler proof exists.

Exactly one side-effecting producer is active per job type. Rollback may select
an approved previous adapter for new work, but it preserves canonical IDs and
terminal history and never selects Google Cloud Tasks/Run/OIDC. Late delivery
after cancel, expiry, or terminal failure is a no-op or bounded quarantine
observation. Ambiguous publication uses deterministic/queryable dedupe or
operator review; it is never blindly republished.

## Tests

- Direct-call audit has no unapproved migrated producer.
- Legacy status projection remains compatible and cannot become canonical truth.
- Late legacy delivery cannot create a replacement job or paid side effect.
- Provider operation keys are reused after ambiguous delivery.
- One active side-effecting producer and safe rollback are enforced.

## Acceptance

All remaining compatibility entries have owner, deadline, active producer,
rollback, late-delivery rule, and evidence. No new hard-cutover production work
uses an unapproved legacy path.

## Implemented

- The Feature 186 call-site audit remains the source inventory; the Feature 192
  inventory includes its seven legacy status readers and the three intentional
  legacy adapter calls as compatibility-drain records.
- Hard cutover keeps legacy queue/status paths as references only and applies
  no Google Cloud Tasks, Cloud Run, OIDC, or Google publisher fallback.
- Local Queue late-delivery and duplicate-delivery tests verify no second
  canonical execution side effect.
