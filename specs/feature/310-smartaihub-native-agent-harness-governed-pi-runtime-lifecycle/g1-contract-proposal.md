# SPEC-310 G1 Contract Proposal (Owner Review Required)

**Status:** `PROPOSED_NOT_APPROVED`

**Review base:** `origin/main` `5cb2d07f91fd5da7fd486c317760be199cf03336`
**Purpose:** give existing producer owners a small, reviewable contract proposal. This document does not create an endpoint, permission, runtime API, durable store, or authority grant.

## Contract boundary

The producer/consumer transport and public names remain undecided until the owners approve them. The `v1` labels below identify proposal compatibility shapes only; they are not stable integration commitments. References are opaque IDs resolved by their existing owner. No credential, bearer token, secret, or copied authority is transported in a Chat message or persisted as a SPEC-310 record.

Native Harness is a subordinate runtime capability. Python OpenAI Agents API remains the repository's agent runtime authority. A privately managed Pi runtime may execute inside the Native Harness; it does not become a planner, scheduler, job store, approval authority, or team runtime. Native model calls use SmartAIHub Gateway only. Orca is not required.

Git, GitHub, repository, branch and worktree references are optional. A Chat-first general-work request may omit `workspaceRef` and produce an artifact through existing Work Context, canonical `worker_jobs` plus outbox, executor, Gateway/economic and Library/artifact authorities.

## Proposed shapes

```ts
type NativeRunIntentV1Proposal = {
  contract: "native-run-intent.v1";
  conversationRef: string;
  desktopActorRef: string;       // authenticated user; never an execution grant
  tenantRef: string;
  workContextRef: string;
  workspaceRef?: string;         // omission is valid; Git is never required
  goal: string;
  attachmentRefs: string[];
  requestedCapabilityRefs: string[]; // request only; every item is re-authorized
  policySnapshotRef: string;
  budgetLimitRef: string;
  idempotencyKey: string;
};

type NativeAttemptGrantV1Proposal = {
  contract: "native-attempt-grant.v1";
  canonicalJobRef: string;        // SPEC-195 / approved SPEC-279 admission
  attemptRef: string;
  tenantRef: string;
  desktopActorRef: string;
  runnerDeviceRef: string;        // enrolled Runner identity, not user identity
  executionGrantRef: string;      // short-lived, per-attempt, attenuated grant
  leaseFenceRef: string;
  runtimeManifestDigest: string;
  gatewayInvocationGrantRef: string; // Gateway-only model transport
  effectiveCapabilityGrantRefs: string[];
  workspaceRef?: string;
  expiresAt: string;
};

type NativeAttemptResultV1Proposal = {
  contract: "native-attempt-result.v1";
  canonicalJobRef: string;
  attemptRef: string;
  outcome: "succeeded" | "failed" | "cancel_requested" | "cancel_observed" | "indeterminate";
  artifactRefs: Array<{ ref: string; digest: string; provenanceRef: string }>;
  gatewayUsageRef?: string;
  settlementRef?: string;
  observedAt: string;
};
```

`outcome` is a report from the executor, not an authoritative state transition. SPEC-195/279 job state and Task Control projections remain authoritative. A cancellation request is not proof that the process or child attempts stopped. Artifact and usage references are claims until their owning service verifies them.

## Identity and authority matrix

| Identity | Authenticates | May request | Does not grant |
|---|---|---|---|
| Desktop user | Human actor and Chat conversation | Submit intent and request capabilities | Runner-device identity, execution, workspace ACL, Gateway usage or spend |
| Runner device | Enrolled execution endpoint | Prove device/session identity and receive a bound attempt | User identity, job admission, capability, Gateway usage or spend |
| Per-attempt execution grant | One canonical job/attempt, tenant, fence, capabilities, workspace and expiry | Execute only the admitted attempt within the exact bounds | New job admission, a different attempt/tenant, broader capabilities, or use after revocation/expiry |
| Gateway invocation grant | One authorized Native attempt's model transport and budget | Invoke models through SmartAIHub Gateway | Direct provider access or an independent credit/settlement ledger |

`llm:chat` permits Chat LLM interaction only. It is never accepted as evidence of `executionGrantRef`, Runner enrollment, capability grant, workspace ACL, or Gateway invocation authority. Grants are references issued and checked by their existing authorities; SPEC-310 must not mint them.

## Admission, replay, and failure semantics

1. Treat an intent as a request. The existing command ingress, policy, budget, capability and canonical job authority decide whether it may run.
2. Bind admission to `(tenantRef, desktopActorRef, conversationRef, idempotencyKey)`. Repeating the same key with the same canonicalized request returns the existing admission result; reusing it with a different request returns `IDEMPOTENCY_CONFLICT` and creates no second job.
3. Bind an attempt grant to exactly one `canonicalJobRef`, `attemptRef`, `runnerDeviceRef`, `leaseFenceRef`, tenant, workspace, capability set and expiry. Reject missing, revoked, expired, mismatched, stale-fence and cross-tenant grants before execution.
4. Reject unknown major contract versions. A consumer may ignore additive optional fields only when explicitly listed as compatible by the approving owners. Never infer default execution permission from an unknown field.
5. Return a stable rejection category without leaking grant contents: `UNAUTHENTICATED_ACTOR`, `UNENROLLED_DEVICE`, `EXECUTION_GRANT_REQUIRED`, `GRANT_REVOKED_OR_EXPIRED`, `TENANT_SCOPE_MISMATCH`, `ATTEMPT_OR_FENCE_MISMATCH`, `CAPABILITY_DENIED`, `WORKSPACE_DENIED`, `IDEMPOTENCY_CONFLICT`, `UNSUPPORTED_CONTRACT`, `GATEWAY_UNAVAILABLE`, `ADMISSION_UNAVAILABLE`, or `ARTIFACT_INTEGRITY_MISMATCH`.
6. On Gateway, executor or artifact outage, fail closed for new execution. Do not route to a direct provider or turn a partial receipt into a successful/settled job. `cancel_requested` records intent only; `cancel_observed` requires an observed stop; `indeterminate` remains nonterminal until recovery reconciles against the canonical attempt/fence and process state.
7. Missing `workspaceRef` is allowed only for operations whose approved capabilities need no workspace. It is not an implicit local filesystem, home-directory, or repository grant.

## Minimum negative fixtures

| Fixture | Expected result |
|---|---|
| Desktop credential has only `llm:chat`, no attempt grant | `EXECUTION_GRANT_REQUIRED`; no job execution |
| Runner device credential presented as desktop actor | `UNAUTHENTICATED_ACTOR`; no actor impersonation |
| Valid grant for another tenant, attempt, device, fence or workspace | Corresponding scope rejection; no side effect |
| Grant expired or revoked immediately before start | `GRANT_REVOKED_OR_EXPIRED`; no execution |
| Same idempotency key and same normalized intent | Return original canonical admission; one job only |
| Same idempotency key with changed goal, workspace or capabilities | `IDEMPOTENCY_CONFLICT`; no second job |
| Unsupported major contract version or stale producer version | `UNSUPPORTED_CONTRACT`; no permissive downgrade |
| No workspace on a read-only analysis/report request | May proceed only after ordinary policy/capability admission; Git is not required |
| No workspace on a filesystem or repository operation | `WORKSPACE_DENIED`; no implicit path access |
| Gateway unavailable or direct-provider-only configuration | `GATEWAY_UNAVAILABLE`; no fallback or successful usage claim |
| Cancel requested while child process is still running | Keep attempt nonterminal until observed termination/reconciliation |
| Artifact ref points across tenant or digest does not match | Reject artifact projection; do not publish it |

These fixtures define review expectations only. They are not runtime test receipts or acceptance evidence.

## Owner review and compatibility

| Contract surface | Existing owner boundary | Review status at base SHA |
|---|---|---|
| Chat intent and Runner ingress | SPEC-205; Chat/desktop producer | `WAITING_OWNER`; PR #1161 is open/read-only and fails `local-contract` |
| Admission, attempt, lease and status | SPEC-195 and SPEC-279 | `PROPOSED_NOT_APPROVED` |
| Runtime manifest, device and recovery | SPEC-278 and SPEC-205 | `PROPOSED_NOT_APPROVED`; Pi provenance/ABI not proven |
| Team delegation and child attempts | SPEC-269 | `PROPOSED_NOT_APPROVED` |
| Workspace and artifact ACL | SPEC-292, SPEC-278, SPEC-293 | `PROPOSED_NOT_APPROVED`; no new workspace authority |
| Gateway use, credits and settlement | SPEC-207 and SPEC-280 | `PROPOSED_NOT_APPROVED`; no real Native receipt |
| Development and independent acceptance | SPEC-224 and SPEC-271 | `PROPOSED_NOT_APPROVED`; SPEC-224 E2E retains priority |

Owner acceptance must name the exact contract revision and compatible producer/consumer SHA. Any semantic change to another SPEC goes through a focused `CROSS_SPEC_CHANGE_REQUEST`; do not edit another owner's branch. Until the Chat/Runner ingress contract is merged and acknowledged, section 05 remains `WAITING_STABLE_APPROVED_RUNNER_CHAT_CONTRACT`. Production Native execution remains disabled until real Gateway, settled-credit, execution-authority and independent acceptance proofs exist.
