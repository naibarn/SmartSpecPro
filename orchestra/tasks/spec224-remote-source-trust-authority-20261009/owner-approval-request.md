# Owner Approval Request — SPEC-224 Non-Production Source Trust

**State:** `OWNER_AUTHORITY_REQUIRED`
**Requested decision:** approve or reject the bounded non-production trust authority below. No issuer, key, bucket, secret, grant, or runtime behavior has been activated.

**Inventory checkpoint:** checked against canonical `2b576aaa5c29500155fcf3000891017bc3b54c8f` on 2026-10-09. `apps/cloudflare/wrangler.jsonc` configures `smartspec-cloudflare-runtime` with activation disabled, local environment, and no resource bindings. No `wrangler` CLI or Cloudflare/R2/KMS environment-variable names are available in this task process, so account-level resource inventory was not possible. Treat actual resource existence as **unknown**; the repo only confirms test-only `spec224-admission-test*` storage plumbing. See `authority-design.md` for the evidence and limitations.

## Decision needed from the accountable Platform/Security owner

Authorize a dedicated server-side non-production issuer to sign evidence only after the existing SPEC-224 source verifier has verified actual bundle and required artifact contents and the server has loaded canonical tenant/DevelopmentRun/WorkUnit/job/attempt state.

The owner must identify these authorities in the approval record; do not send secret values. The proposed names below are logical labels only and do not represent provisioned identities/resources:

1. **Issuer identity and owner:** logical proposal `SmartSpecPro SPEC-224 non-production source attestor`; identify the exact existing authenticated server workload principal, authentication source, owning team/individual, allowed code entrypoint, and permitted tenant/environment scope. It must be the workload that can load canonical run/job/attempt state; the Cloudflare Worker config inspected here is disabled/local and is not established as that authority.
2. **Signing root:** identify an approved asymmetric KMS signing operation if available, or approve the exact alternative and its key-exposure risk. Return key resource, key ID/public fingerprint, signer principal, rotation/overlap and revocation rules. Cloudflare Secrets Store is account-level secret storage whose bound value is retrieved into Worker code; the docs inspected do not establish a non-exportable signing API. Do not treat it as KMS without explicit Security acceptance. Reuse of Content Protection, Worker Runtime, JWT, package-HMAC, or Runner keys is explicitly not requested.
3. **Evidence storage:** preferred logical target is a dedicated non-production R2 bucket with prefix `spec224/<tenant-id>/<profile-digest>/`; owner must provide the actual provider/account/bucket IDs, endpoint, retention/versioning/object-lock controls, writer identity, distinct read-only verifier identity, and proof verifier writes/deletes are denied. Approve exact allowed object-key patterns and maximum evidence/object count/size/deadline limits. Existing `spec224-admission-test*` is test-only until separately approved and verified.
4. **Trust policy:** approve accepted trust class (`REMOTE_TEST_TRUSTED` only), exact tenant/project/environment/profile allowlist, maximum evidence age and clock skew, evidence invalidation/revocation authority, key-rotation acceptance, behavior for revocation racing protected start, evidence-retention period, and the operational incident owner.
5. **Canonical bindings:** approve mandatory binding to tenant, DevelopmentRun and WorkUnit revisions, job/attempt/fencing, source commit/tree/digests, profile, all artifact digests, Runner node/session and capability snapshot revision.
6. **Verification operator:** identify which existing server-side service performs signature and object-content verification and which accountable team owns alerting, incident response, key rotation, and revocation.

## Proposed bounded scope

- Environment: isolated non-production tenant/project only.
- Trust class: `REMOTE_TEST_TRUSTED`; no production trust.
- Operation: verify one source bundle and its listed artifacts for the exact job attempt and Runner session. No automatic grant, approval, budget, dispatch, deployment, or owner-scope expansion.
- Storage: content-addressed immutable object references in an explicitly approved bucket/prefix; no arbitrary URL fetch.
- Signing: purpose-specific server-held Ed25519 private key; only public key and fingerprint may be distributed to verifier components.
- Expiry/revocation: fail closed on unknown key/issuer, expired/future evidence, changed object, unavailable storage, stale binding, revoked evidence/key, or unavailable revocation authority.
- Runtime integration remains a later Lane 1 checkpoint after this authority is provisioned, tested, and accepted. Protected runtime admission stays deny-only until then.

## Owner response format

Provide an authenticated approval record with (IDs/references only; never secret values):

```text
decision: APPROVE_NONPRODUCTION_SOURCE_TRUST | REJECT
approver_identity: <authenticated server-derived identity>
issuer_identity: <exact workload principal and owner>
issuer_service_entrypoint_and_environment: <existing service and deployed environment>
signing_key_resource_and_operation: <KMS signing key or explicitly accepted secret-backed signer; no secret value>
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

The requested decision is bounded to authorizing one isolated non-production source-trust authority and its policy. It does not approve creation of any identity, key, bucket, secret, binding, or deployment by this task until the approval record identifies the exact resources and provisioning authority. If the account contains suitable resources, provide their exact IDs and ownership so they can be verified read-only before adapters are built. If not, approve the named provisioning request through the existing platform workflow.

Do not include credentials or private key material in the approval response. This request does not ask for live dispatch approval or economic provisioning.
