# Workunit A — SPEC-224 Remote Trust Authority Discovery

**State:** `AUTHORITY_MISSING_FAIL_CLOSED`
**Inspected source:** `a6cf3d5efc8f8ae93b67946fdf93941af0ec25f4`
**Scope:** read-only source and local Runner readiness audit; no trust configuration, credentials, grants, or dispatch changed.

## Findings

- `apps/web/server/services/spec224TrustedSourceAttestation.ts` v2 creates only `LOCAL_NONPRODUCTION_INTEGRITY_ONLY` attestations. Its issuer is `spec224-local-source-verifier.v2`; provider and object reference are local; remote evidence digest is null.
- The contract lists `REMOTE_TEST_TRUSTED` and `PRODUCTION_TRUSTED`, but `PRODUCTION_TRUSTED` is explicitly rejected. Remote-shaped values are checked for provider/reference/digest shape only; there is no remote signer/issuer verifier in this service.
- `apps/web/server/services/spec224RuntimeAdmission.ts` denies `REMOTE_TEST_TRUSTED` with `DENIED_REMOTE_TRUST_REQUIRED` even when the digest is SHA-256-shaped and the object reference is `s3://...`. The persisted admission path also denies `REQUIRES_REMOTE_TRUST` returned from the recovery-grant validation call.
- `apps/web/server/services/spec224RecoveryGrantValidator.ts` calls the Python recovery-grant validation endpoint. `ApprovalDbService.validate_spec224_recovery_grant()` checks grant tenant/owner/state, expiry, scope digest, source/job binding values supplied in the request, and audit integrity. It does not retrieve or verify source-attestation evidence.
- Source-bundle code computes local manifest, bundle, and artifact evidence digests. No configured S3/R2 source-attestation retrieval and verification authority was found in the traced SPEC-224 path.
- Existing Runner device signatures authenticate Runner/device command channels and updates; no code path binds those signatures as a source-attestation issuer or verifies a remote source trust root.
- The attestation path records invalidation for source changes, bundle revocation, owner revocation, and security review. No remote trust authority was found that can re-fetch its issuer evidence and check freshness/revocation at protected start.

## Minimum missing authority

A production-approved remote source-trust verifier and trust-root configuration must be identified or explicitly provisioned by its owner. It must verify the trusted issuer/signature, retrieve the immutable evidence object, recompute content/digest, enforce freshness and revocation, and bind tenant, DevelopmentRun, worker job/attempt, source commit/tree/digest, profile, artifact evidence, and authorized Runner/session/capability snapshot. A URL or digest field alone is not verification. Until that authority exists, remote admission remains denied.

## Supported Windows readiness probe

On 2026-10-09 the local `smartaihub-runner status` read completed: `local-runner`, version `0.2.13`, state `ready`, 11 discovered tools, `readyToolCount=0`; Codex is installed but auth, availability, and health remain `unknown`, trust is `discovered`, reason `probe_required`. The read-only TCP probe to `192.168.1.123:22` timed out. This is local Linux discovery only, not Windows readiness or a Control Plane capability acknowledgement. No Codex probe/job was run.

## Proof boundary and next action

This audit establishes a missing verifier in the traced production admission path; it does not establish that no external verifier exists outside repository/runtime access. Ask the accountable owner to identify the approved verifier, trusted issuer/root, evidence source, and verifier configuration owner. Keep `DENIED_REMOTE_TRUST_REQUIRED`; do not dispatch until server-side verification and fresh bound evidence pass.
