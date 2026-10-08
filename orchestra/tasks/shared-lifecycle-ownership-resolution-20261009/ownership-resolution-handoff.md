# SPEC-224 Runtime Admission Ownership Resolution

**Decision:** `COORDINATED_CHANGE`
**Decision recorded:** 2026-10-09
**Canonical repository:** `naibarn/SmartSpecPro`
**Source SHA inspected:** `cf4fccc2b9744451f68a66f632049073ce0bb981`
**Current Lane 1 worktree:** `/home/dev/.cache/codex/worktrees/lane1-verifier-lockfix-20261009`, branch `codex/lane1-verifier-lockfix-20261009`, at the inspected SHA; clean
**Reservation owner:** Lane 1 — SPEC-224 protected Runner admission / trusted execution

## Decision and exact path scope

Lane 1 retains sole write ownership of these paths because both remain part of the protected execution-start authority and are required to close remote trust admission:

- `apps/web/server/services/spec224RuntimeAdmission.ts`
- `apps/web/server/services/__tests__/spec224RuntimeAdmission.test.ts`

No paths are released. Shared Lifecycle may supply its approved, versioned eligibility contract from its own collision-free workunit, but it must not create a competing change to either reserved path. Lane 1 is the single canonical writer that will integrate the eligibility contract into runtime admission. Eligibility remains advisory input; it cannot grant Runner trust, a grant, approval, lease, fencing authority, economic authorization, or persisted-proof dispatch.

## Ownership and activity evidence

At `cf4fccc2b9744451f68a66f632049073ce0bb981`, the Lane 1 verifier-lockfix worktree and Shared Lifecycle eligibility-proposal worktree were clean. A read-only scan of all registered worktrees found no dirty changes or branch deltas for either reserved file. The repository workspace authority resolver reported no active sessions. Therefore no current code edit is in flight on these exact paths; the logical reservation remains with Lane 1 because the paths are still necessary to finish its protected-start/trusted-Runner scope.

The Shared Lifecycle proposal is architecture evidence, not a runtime API: its interface is explicitly illustrative. The project owner accepted the advisory eligibility boundary and DevelopmentRun-only Phase 1 architecture in PR #374. The user reports that Lane 2-2 verified the production DevelopmentRun execution path; that lane evidence was not located in this repository scan, so implementation must bind to its exact verified source SHA/evidence before wiring.

## Remote trust admission blocker

The remote path remains deny-only. `evaluateSpec224RuntimeAdmission()` checks that `REMOTE_TEST_TRUSTED` has a SHA-256-shaped evidence digest and an `s3://` object reference, then returns `DENIED_REMOTE_TRUST_REQUIRED`. The persisted protected-start path also maps grant validation `REQUIRES_REMOTE_TRUST` to the same deny reason. These fields prove shape and reference only; they do not prove trusted provenance.

The production path has no verified remote trust-verification authority that retrieves the referenced evidence and validates its trusted issuer/signature, object/content digest, freshness/revocation, and binding to tenant, DevelopmentRun, job/attempt, source revision, profile, and artifact. The Python grant validator currently validates owner-issued grant scope and bindings; it is not that source-trust verifier. `PRODUCTION_TRUSTED` attestations are explicitly unsupported by the current attestation contract. Do not relax the deny path, synthesize verification, or infer trust from an S3 URI/digest.

## Conditions before Shared Lifecycle runtime implementation

1. Shared Lifecycle supplies a versioned eligibility contract with stable states/reason codes, evidence provenance/freshness, ownership-conflict semantics, and fail-closed behavior. `READY` must not imply dispatch authority.
2. Record Lane 2-2 production-path evidence and exact source SHA in its workunit handoff; the integration point must be the verified production caller, not an uncalled service seam.
3. Keep a single writer: Lane 1 integrates the contract into the two reserved paths through the normal canonical PR workflow. Shared Lifecycle work remains outside those paths until a later explicit ownership change.
4. Preserve all existing Runner trust, tenant, grant, approval, lease, fencing, economic, idempotency, receipt, and persisted-proof dispatch gates. Add focused tests for advisory eligibility and all fail-closed cases without claiming live dispatch.
5. Revisit the reservation only after the coordinated integration is merged and its handoff identifies the next owner and exact files.

## Next independently eligible workunit

`LANE1_REMOTE_TRUST_VERIFIER_AUTHORITY_DISCOVERY` — read-only discovery of an already-authorized remote evidence verifier, its trusted issuer/configuration, evidence source, and accountable owner. If none exists, prepare the exact authority/contract request and continue Lane 1's separate Windows/Linux Runner readiness work without dispatch. No credentials, grants, economic records, or runtime trust configuration are changed by this workunit.

## Evidence boundary

This is an ownership and source audit at `cf4fccc2b9744451f68a66f632049073ce0bb981`. It is not evidence of remote trust verification, live Runner admission, or dispatch. The Lane 1 economic settlement tests remain separate disposable-PostgreSQL evidence.
