# Section 08 — Generic Personal Mini-App Continuous Delivery

## Outcome

Record the completed Expense Tracker V1→V2 pilot from durable production receipts, then remove pilot-specific runtime identity/repository/ref/digest checks. Any authenticated private Mini-App owner must be able to submit an exact candidate branch and Git SHA from that App's already-bound dedicated repository. The server verifies the repository binding, source lineage, candidate manifest and file digests, creates one idempotent DevelopmentRun for that revision, and advances only app-scoped package/deploy/smoke stages. A failed candidate never replaces Last-Known-Good. Existing durable job recovery continues the same run from the last checkpoint; the expired root anchor remains audit history and does not invalidate settled stages.

## Scope

- Keep the Expense Tracker Git revision, source and V1/V2 ledger as immutable regression fixtures; do not mutate or regenerate either app version.
- Replace the pilot constant and app-specific UI with owner-authenticated branch/revision adoption against the current App Identity and dedicated repository binding.
- Validate exact source ancestry, manifest, source/file hashes and generated artifact before queueing the existing `worker_jobs` pipeline.
- Generalize package/deploy/smoke markers and stage behavior; bind immutable version and promote LKG only after successful verification.
- Retain the normal prompt path, current app source repository, existing Gateway, storage, job/outbox, fencing, settlement and reconciliation systems.
- Add focused service/router/worker/UI tests, including cross-app isolation, idempotent repeated adoption, invalid branch/revision/manifest/digest, active run handling, LKG preservation and completed-stage reconciliation.
- Record pilot receipts/version digests and owner-acceptance state in the existing SPEC-224 handoff. Do not mark owner browser acceptance complete without authenticated owner evidence.

## Order

1. Reconcile pilot database receipts and capture evidence.
2. Define the generic bound-repository candidate contract and import exact immutable source.
3. Use the contract in authenticated adoption UI/API and create a stable same-App/same-revision run key.
4. Package and promote generically in existing stages; make terminal anchor expiration informational when all stage receipts and WorkUnit are complete.
5. Run focused tests, integrate each safe slice and deploy only shared runtime changes that require it.

## Acceptance

- No shared runtime module has the Expense Tracker App ID, repository owner/name, pilot branch/SHA, or candidate digests embedded as policy.
- Different test App IDs and bound repositories can adopt valid revisions; a foreign/unbound repository or cross-App candidate is denied.
- One candidate SHA yields one run and one version; retries reuse the same durable run or continue its last unfinished stage without model generation.
- Stage receipts, immutable source/artifact digests, version history, rollback and LKG semantics remain correct.
- V1/V2 pilot evidence remains intact; root anchor expiration does not overwrite successful package/deploy/smoke status.
- Unauthenticated access and cross-owner adoption remain denied. Owner browser acceptance remains pending until actually observed.
