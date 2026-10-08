# Workunit C — Runtime Admission Integration

**State:** `BLOCKED_AUTHORITY_UNAVAILABLE`
**Canonical base checked:** `origin/main` at `a6cf3d5efc8f8ae93b67946fdf93941af0ec25f4`
**Protected writer:** Lane 1

## Decision

Do not wire `developmentRunEligibility.v1` into runtime admission yet. Keep these reserved paths unchanged:

- `apps/web/server/services/spec224RuntimeAdmission.ts`
- `apps/web/server/services/__tests__/spec224RuntimeAdmission.test.ts`

The new contract is advisory and fail-closed, but that does not supply the missing production source-trust decision. Runtime integration before a verifier exists could accidentally imply eligibility authorizes a protected start.

## Exact blocker

The traced production path has no approved authority that retrieves immutable remote source-attestation evidence, validates the trusted issuer/signature and recomputed content digest, checks freshness/revocation, and binds the evidence to tenant, DevelopmentRun, job/attempt, source commit/tree/profile/artifact, and the authorized Runner session/capability snapshot. Existing grant validation verifies grant scope; it is not remote source trust verification. Remote-shaped attestation and S3 URI/digest alone remain denied as `DENIED_REMOTE_TRUST_REQUIRED`.

## Conditions to resume

1. The accountable security/platform owner identifies the approved verifier, trusted issuer/root, evidence store, freshness/revocation semantics, and configuration owner.
2. The verifier contract returns authenticated evidence bound to all protected-start fields and exposes failure/expiry/revocation outcomes.
3. Provide the exact-SHA artifact for the claimed Lane 2-2 production DevelopmentRun path so the adapter target and predicates are grounded in verified production behavior.
4. Lane 1 reviews and remains sole writer of the two protected files; add focused negative tests proving every missing/expired/mismatched verifier result remains denied.
5. Only after those gates pass, prepare and verify separate owner approval, grant, Runner, workspace, and economic authorities. This handoff itself grants none of them.

## Next independently eligible workunit

Request/locate the authorized remote source-trust verifier contract and owner evidence; continue Windows host read-only readiness only if a supported authenticated status channel becomes available. Do not perform live dispatch or claim Runner readiness, trust admission, settlement, or deployment from this checkpoint.
