# D3.41 Review Convergence

## Round 1 — Findings and repair

- Finding (MUST_FIX): Runner's semantic `capabilitySnapshotId` is not the database row UUID. Rust constructs IDs as `capability:<runner>:<timestamp>` while `runner_capability_snapshots.id` is `varchar(36)`. Comparing the semantic value to the row primary key made valid approval resume fail closed; persisting it as the primary key would also exceed schema width. Fixed `assertRunnerAuthorizationBinding` to compare `snapshotJson.capabilitySnapshotId` while preserving tenant/runner/revision/session/trust/revocation/expiry checks. The PostgreSQL E2E asserts semantic ID and row UUID differ and that the canonical resume succeeds.
- Finding (MUST_FIX/test defect): The E2E initially expected a separate `APPROVAL_DELIVERY_RECONCILED` event despite `resolveComputerUseApproval` already owning the delivery's idempotency key and persisting `APPROVAL_RESOLVED`. Corrected assertion to the actual canonical event plus separate durable ACK, without weakening behavior or changing idempotency.
- Green after fixes: cross-language PostgreSQL E2E 1/1; focused runner/approval/control-plane Vitest 62/62; economic PostgreSQL 7/7; Python approval PostgreSQL 1/1.

## Round 2 — Targeted source/security review

- Reviewed Python claim/ACK API and SQLAlchemy service: internal gateway token, row locking with `SKIP LOCKED`, bounded lease and epoch, digest/correlation checks, cancellation/decision serialization; no new queue/table or SQL interpolation from user input found.
- Reviewed Node caller: existing Feature 186 periodic reconciliation invokes the durable claim; correlation and lease are revalidated; transitions remain in canonical worker control plane; provider is not invoked by this test path.
- Reviewed economic tRPC caller/service: authenticated `adminProcedure`, tenant derived from context, scope-specific validation, transactional idempotent audit, zero-balance account; no production funding mutation. Post-capture refund remains fail-closed.
- Reviewed fresh-profile DDL and ownership: only isolated Spec 224 baseline schema/migration changed. `revoked_token_jtis` overlap with Feature 245 migration 0345 is explicitly retained as a promotion blocker; no migration history was rewritten.
- Verdict: no unresolved in-scope critical/high finding. External owner-policy, upgrade, runtime-admission, Rust Runner/provider and production gates remain BLOCKED, not treated as code-review findings.

## Round 3 — Post-commit verification review

- Verified scoped commits `ffe8b21b9`, `8ac7d3859`, `a3c8c3f65`; file manifests are disjoint by Track A/B/C.
- D3.35 is an ancestor of the D3.40 base and current branch; no duplicate merge/cherry-pick was performed.
- Verified Spec 224 SHA, isolated migration/journal hashes, Drizzle `check`, PostgreSQL 15.17 journal/schema counts and non-superuser role flags.
- `git diff --check` and Python compilation pass; focused Vitest/Python PostgreSQL gates are fresh after the last code change. No manifests/lockfiles, historical migrations, Cloudflare-owned paths, `.env`, or shared checkout paths are in the commits.
- Verdict: clean; no new in-scope finding. External migration/profile overlap, refund policy, upgrade baseline, runtime admission and provider/production gates remain explicitly blocked.
