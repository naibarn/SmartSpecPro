# Owner Approval Request — SPEC-224 Non-Production Source Trust

**State:** `OWNER_AUTHORITY_REQUIRED`
**Requested decision:** approve or reject the bounded non-production trust authority below. No issuer, key, bucket, secret, grant, or runtime behavior has been activated.

## Decision needed from the accountable Platform/Security owner

Authorize a dedicated server-side non-production issuer to sign evidence only after the existing SPEC-224 source verifier has verified actual bundle and required artifact contents and the server has loaded canonical tenant/DevelopmentRun/WorkUnit/job/attempt state.

The owner must identify these authorities in the approval record; do not send secret values:

1. **Issuer identity and owner:** exact workload/service principal, authentication source, owning team/individual, allowed code entrypoint, and permitted tenant/environment scope.
2. **Signing root:** approve a new purpose-specific Ed25519 key in the approved secret manager/KMS; identify the secret-manager path/key resource, key ID/fingerprint, signing permission principal, rotation/overlap rules, and revocation behavior. The private key remains in KMS/secret manager. Reuse of Content Protection, Worker Runtime, JWT, package-HMAC, or Runner keys is explicitly not requested.
3. **Evidence storage:** identify provider, account, exact bucket identity, endpoint, dedicated non-production prefix, retention/versioning/object-lock policy, writer identity, distinct read-only verifier identity, and proof that verifier writes/deletes are denied. Approve exact allowed object-key patterns and maximum evidence/object count/size/deadline limits.
4. **Trust policy:** approve accepted trust class (`REMOTE_TEST_TRUSTED` only), tenant/profile scope, maximum evidence age and clock skew, evidence invalidation/revocation authority, key-rotation acceptance, behavior for revocation racing protected start, and evidence-retention period.
5. **Canonical bindings:** approve mandatory binding to tenant, DevelopmentRun and WorkUnit revisions, job/attempt/fencing, source commit/tree/digests, profile, all artifact digests, Runner node/session and capability snapshot revision.
6. **Verification operator:** identify which server-side service performs signature and object-content verification and which team owns alerting, incident response, key rotation, and revocation.

## Proposed bounded scope

- Environment: isolated non-production tenant/project only.
- Trust class: `REMOTE_TEST_TRUSTED`; no production trust.
- Operation: verify one source bundle and its listed artifacts for the exact job attempt and Runner session. No automatic grant, approval, budget, dispatch, deployment, or owner-scope expansion.
- Storage: content-addressed immutable object references in an explicitly approved bucket/prefix; no arbitrary URL fetch.
- Signing: purpose-specific server-held Ed25519 private key; only public key and fingerprint may be distributed to verifier components.
- Expiry/revocation: fail closed on unknown key/issuer, expired/future evidence, changed object, unavailable storage, stale binding, revoked evidence/key, or unavailable revocation authority.
- Runtime integration remains a later Lane 1 checkpoint after this authority is provisioned, tested, and accepted. Protected runtime admission stays deny-only until then.

## Owner response format

Provide an authenticated approval record with:

```text
decision: APPROVE_NONPRODUCTION_SOURCE_TRUST | REJECT
approver_identity: <authenticated server-derived identity>
issuer_identity: <exact workload principal and owner>
signing_key_resource: <KMS/secret-manager reference, no secret value>
key_id_and_fingerprint: <approved public-key identity>
storage_provider_account_bucket: <exact non-production identity>
allowed_endpoint_and_prefixes: <exact allowlist>
writer_and_reader_identities: <distinct principals and permissions>
max_evidence_age_and_clock_skew: <approved values>
revocation_authority_and_policy: <existing owner/service and race semantics>
tenant_project_environment_profile_scope: <exact scope>
retention_and_incident_owner: <policy and accountable owner>
approval_record_reference: <durable audit record>
```

Do not include credentials or private key material in the approval response. This request does not ask for live dispatch approval or economic provisioning.
