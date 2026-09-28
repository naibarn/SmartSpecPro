# Section 03 — Marketplace repair

## Ownership

Marketplace Creative QC contracts, artifact persistence, repair outbox worker,
selection/plan revision, and focused server tests.

## Targets

- `marketplaceAutoReviewDraftQualityQc.ts`
- `marketplaceAutoReviewService.ts`
- `marketplaceCapture.ts`
- Marketplace shared/service/router tests

## TDD

Prove artifact lineage, source freshness, product truth and shot-contract
guards, fresh QC, no active replacement on a failed/non-better result, and
duplicate request handling before adding selection mutation.

## Acceptance

Only a passed repaired artifact can be selected; selection creates a new plan
revision, invalidates derived media state, and leaves approval hard-gated on the
durable matching QC report.
